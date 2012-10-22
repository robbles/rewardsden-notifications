#!/usr/bin/env python

from sys import argv
from urllib import quote_plus
from os import system

if(len(argv) != 4):
    print 'usage: send_message.py rUserId message points'
    exit(1)

user, message, points = argv[1:]
user = int(user)
points = int(points)
text = quote_plus(message)

system('curl -v -G rewardsden.com:8080 -dtext="{text}" -dpoints={points} -did={user}'.format(text=text, points=points, user=user))

